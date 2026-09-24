import type { ContentLocale, LegalPage } from "../types";

const fr: LegalPage = {
  slug: "terms",
  title: "Conditions générales d'utilisation",
  description: "Les règles d'usage du site AssurMatch par les visiteurs.",
  updatedAt: "2026-09-19",
  sections: [
    {
      id: "objet",
      heading: "Objet",
      body: [
        "Les présentes conditions générales d'utilisation régissent l'accès et l'usage du site AssurMatch par tout visiteur.",
        "Le site permet de comparer des offres d'assurance indicatives par pays et par produit, puis de demander un devis transmis à un ou plusieurs courtiers partenaires autorisés."
      ]
    },
    {
      id: "acces-au-service",
      heading: "Accès au service",
      body: [
        "L'accès au site et la comparaison d'offres sont gratuits pour le visiteur et ne nécessitent pas la création d'un compte.",
        "Aucun contrat d'assurance n'est conclu sur le site : la souscription, lorsqu'elle a lieu, se fait auprès du courtier partenaire responsable, en dehors d'AssurMatch."
      ]
    },
    {
      id: "role-plateforme",
      heading: "Rôle de la plateforme",
      body: [
        "AssurMatch est un intermédiaire technique de comparaison et de mise en relation. AssurMatch ne vend pas d'assurance, n'émet aucun contrat ni attestation, ne collecte aucune prime et ne délivre aucun conseil personnalisé engageant.",
        "Les règles de classement des offres et le modèle de rémunération d'AssurMatch sont détaillés sur la page Statut réglementaire."
      ]
    },
    {
      id: "obligations-visiteur",
      heading: "Engagements du visiteur",
      body: [
        "Le visiteur s'engage à fournir des informations exactes lors d'une demande de devis, à ne pas soumettre de demandes en doublon ou frauduleuses, et à donner son consentement en connaissance de cause avant toute transmission de ses données à un courtier partenaire."
      ]
    },
    {
      id: "offres-indicatives",
      heading: "Caractère indicatif des offres",
      body: [
        "Chaque prix affiché est un prix indicatif, à confirmer par le courtier partenaire. Chaque offre affichée est une offre indicative.",
        "Un contenu généré par une assistance IA est toujours signalé comme tel et accompagné d'un rappel : il s'agit d'une aide à la compréhension, sans conseil personnalisé engageant."
      ]
    },
    {
      id: "responsabilite",
      heading: "Responsabilité",
      body: [
        "AssurMatch n'est pas partie au contrat d'assurance éventuellement conclu entre le visiteur et le courtier partenaire, et n'est donc pas responsable des décisions commerciales ou contractuelles de ce dernier.",
        "AssurMatch met en œuvre des moyens raisonnables pour assurer la disponibilité du site, sans garantie d'absence totale d'interruption."
      ]
    },
    {
      id: "droit-applicable",
      heading: "Droit applicable et juridiction compétente",
      body: [
        "Le droit applicable et la juridiction compétente en cas de litige sont précisés dans la section « À compléter avant mise en ligne »."
      ]
    },
    {
      id: "modification",
      heading: "Modification des conditions",
      body: [
        "Ces conditions générales d'utilisation peuvent être mises à jour ; la date de dernière mise à jour figure en haut de cette page."
      ]
    }
  ],
  placeholders: ["Droit applicable et juridiction compétente"]
};

const en: LegalPage = {
  slug: "terms",
  title: "Terms of use",
  description: "The rules for using the AssurMatch site as a visitor.",
  updatedAt: "2026-09-19",
  sections: [
    {
      id: "objet",
      heading: "Purpose",
      body: [
        "These terms of use govern access to and use of the AssurMatch site by any visitor.",
        "The site lets visitors compare indicative insurance offers by country and product, then request a quote transmitted to one or more authorised partner brokers."
      ]
    },
    {
      id: "acces-au-service",
      heading: "Access to the service",
      body: [
        "Access to the site and comparing offers are free for the visitor and require no account creation.",
        "No insurance contract is concluded on the site: when a subscription happens, it happens with the responsible partner broker, outside AssurMatch."
      ]
    },
    {
      id: "role-plateforme",
      heading: "Role of the platform",
      body: [
        "AssurMatch is a technical comparison and introduction intermediary. AssurMatch does not sell insurance, does not issue a contract or a certificate, does not collect a premium and does not give binding personal advice.",
        "The offer ranking rules and AssurMatch's remuneration model are detailed on the Regulatory status page."
      ]
    },
    {
      id: "obligations-visiteur",
      heading: "Visitor commitments",
      body: [
        "The visitor agrees to provide accurate information when requesting a quote, not to submit duplicate or fraudulent requests, and to give informed consent before any of their data is transmitted to a partner broker."
      ]
    },
    {
      id: "offres-indicatives",
      heading: "Indicative nature of the offers",
      body: [
        "Every price shown is an indicative price, to be confirmed by the partner broker. Every offer shown is an indicative offer.",
        "Content generated by an AI assistant is always labelled as such and comes with a reminder: it is help understanding, not a binding personal recommendation."
      ]
    },
    {
      id: "responsabilite",
      heading: "Liability",
      body: [
        "AssurMatch is not a party to any insurance contract eventually concluded between the visitor and the partner broker, and is therefore not liable for the latter's commercial or contractual decisions.",
        "AssurMatch uses reasonable means to keep the site available, without guaranteeing the total absence of interruptions."
      ]
    },
    {
      id: "droit-applicable",
      heading: "Governing law and jurisdiction",
      body: ["The governing law and competent jurisdiction in case of a dispute are listed in the \"To be completed before launch\" section."]
    },
    {
      id: "modification",
      heading: "Changes to these terms",
      body: ["These terms of use may be updated; the last update date appears at the top of this page."]
    }
  ],
  placeholders: ["Governing law and competent jurisdiction"]
};

export const termsContent: Record<ContentLocale, LegalPage> = { fr, en };
