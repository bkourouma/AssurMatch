import type { ContentLocale, LegalPage } from "../types";

const fr: LegalPage = {
  slug: "privacy",
  title: "Politique de confidentialité",
  description: "Les données personnelles traitées par AssurMatch, leurs finalités et vos droits.",
  updatedAt: "2026-09-19",
  sections: [
    {
      id: "responsable-traitement",
      heading: "Responsable du traitement",
      body: [
        "Les données personnelles décrites ci-dessous sont traitées par la société éditrice d'AssurMatch. Son identité complète est listée dans la section « À compléter avant mise en ligne » en bas de cette page."
      ]
    },
    {
      id: "donnees-collectees",
      heading: "Données collectées",
      body: ["Selon les pages utilisées, AssurMatch peut collecter :"],
      bullets: [
        "l'identité et les coordonnées communiquées dans une demande de devis ou un message de contact (nom, e-mail, téléphone) ;",
        "le pays et le produit d'assurance sélectionnés ;",
        "les réponses au formulaire de demande de devis propre à ce produit ;",
        "les documents facultatifs joints à une demande de devis (pièces justificatives demandées par le courtier partenaire) ;",
        "le consentement donné (ou retiré) et sa date."
      ]
    },
    {
      id: "finalites",
      heading: "Finalités du traitement",
      body: ["Ces données sont utilisées pour :"],
      bullets: [
        "mettre en relation le visiteur avec le ou les courtiers partenaires autorisés pertinents pour son pays et son produit ;",
        "transmettre la demande de devis et permettre son suivi ;",
        "produire, lorsque le visiteur le demande, une assistance indicative générée par IA (résumé de besoin, aide à la compréhension), toujours signalée comme telle et sans conseil personnalisé engageant ;",
        "prévenir les demandes en doublon ou frauduleuses ;",
        "établir la facturation entre AssurMatch et les courtiers partenaires (frais par lead qualifié), sans jamais transmettre de coordonnées bancaires du visiteur ni lui facturer quoi que ce soit."
      ]
    },
    {
      id: "base-legale",
      heading: "Base légale",
      body: [
        "La transmission d'une demande de devis repose sur le consentement explicite du visiteur, recueilli par une case à cocher non pré-cochée avant tout envoi.",
        "La prévention de la fraude et des doublons repose sur l'intérêt légitime d'AssurMatch et de ses courtiers partenaires à ne traiter que des demandes réelles."
      ]
    },
    {
      id: "destinataires",
      heading: "Destinataires des données",
      body: [
        "Les données d'une demande de devis sont transmises au courtier partenaire (ou, si le visiteur l'accepte explicitement, aux courtiers partenaires) responsable du pays et du produit concernés.",
        "L'hébergeur technique du site, listé dans les mentions légales, héberge les données mais n'y accède pas pour ses propres finalités.",
        "Les données ne sont jamais vendues à des tiers à des fins commerciales."
      ]
    },
    {
      id: "duree-conservation",
      heading: "Durée de conservation",
      body: [
        "Les données sont conservées pour la durée strictement nécessaire aux finalités décrites ci-dessus, puis supprimées ou anonymisées.",
        "Les durées précises par catégorie de donnée sont listées dans la section « À compléter avant mise en ligne »."
      ]
    },
    {
      id: "droits",
      heading: "Vos droits",
      body: [
        "Chaque visiteur dispose d'un droit d'accès, de rectification et d'effacement de ses données, ainsi que du droit de retirer son consentement à tout moment.",
        "Pour une demande de devis déjà transmise, le retrait de consentement s'effectue directement depuis la page de suivi de cette demande (lien reçu après l'envoi).",
        "Pour toute autre demande relative à ses données, ou en l'absence de lien de suivi, le visiteur peut écrire via la page Contact."
      ]
    },
    {
      id: "autorite-controle",
      heading: "Autorité de contrôle",
      body: [
        "Le visiteur dispose du droit d'introduire une réclamation auprès de l'autorité de protection des données personnelles compétente. Le nom de cette autorité, qui dépend du pays du visiteur, est listé dans la section « À compléter avant mise en ligne »."
      ]
    }
  ],
  placeholders: [
    "Responsable du traitement (raison sociale, adresse)",
    "Délégué ou déléguée à la protection des données (contact)",
    "Autorité de contrôle compétente",
    "Durées de conservation précises par catégorie de donnée"
  ]
};

const en: LegalPage = {
  slug: "privacy",
  title: "Privacy policy",
  description: "The personal data AssurMatch processes, its purposes and your rights.",
  updatedAt: "2026-09-19",
  sections: [
    {
      id: "responsable-traitement",
      heading: "Data controller",
      body: [
        "The personal data described below is processed by the company that publishes AssurMatch. Its full identity is listed in the \"To be completed before launch\" section at the bottom of this page."
      ]
    },
    {
      id: "donnees-collectees",
      heading: "Data collected",
      body: ["Depending on the pages used, AssurMatch may collect:"],
      bullets: [
        "identity and contact details given in a quote request or a contact message (name, e-mail, phone);",
        "the selected country and insurance product;",
        "the answers to that product's quote request form;",
        "optional documents attached to a quote request (supporting documents requested by the partner broker);",
        "the consent given (or withdrawn) and its date."
      ]
    },
    {
      id: "finalites",
      heading: "Purposes",
      body: ["This data is used to:"],
      bullets: [
        "introduce the visitor to the relevant authorised partner broker(s) for their country and product;",
        "transmit the quote request and allow it to be tracked;",
        "produce, when the visitor asks for it, an indicative AI-generated assistance (need summary, help understanding), always labelled as such and never a binding personal recommendation;",
        "prevent duplicate or fraudulent requests;",
        "support billing between AssurMatch and partner brokers (a fee per qualified lead), without ever transmitting the visitor's payment details or charging the visitor anything."
      ]
    },
    {
      id: "base-legale",
      heading: "Legal basis",
      body: [
        "Transmitting a quote request relies on the visitor's explicit consent, collected through an unchecked checkbox before anything is sent.",
        "Preventing fraud and duplicates relies on the legitimate interest of AssurMatch and its partner brokers in only processing genuine requests."
      ]
    },
    {
      id: "destinataires",
      heading: "Data recipients",
      body: [
        "A quote request's data is transmitted to the partner broker (or, if the visitor explicitly accepts it, brokers) responsible for the relevant country and product.",
        "The site's technical host, listed in the legal notice, hosts the data but does not access it for its own purposes.",
        "Data is never sold to third parties for marketing purposes."
      ]
    },
    {
      id: "duree-conservation",
      heading: "Retention period",
      body: [
        "Data is kept for no longer than strictly necessary for the purposes described above, then deleted or anonymised.",
        "The precise retention period per data category is listed in the \"To be completed before launch\" section."
      ]
    },
    {
      id: "droits",
      heading: "Your rights",
      body: [
        "Every visitor has a right to access, rectify and erase their data, and to withdraw consent at any time.",
        "For a quote request already transmitted, consent can be withdrawn directly from that request's tracking page (link received after sending).",
        "For any other request about their data, or in the absence of a tracking link, a visitor can write via the Contact page."
      ]
    },
    {
      id: "autorite-controle",
      heading: "Supervisory authority",
      body: [
        "Every visitor may lodge a complaint with the competent personal data protection authority. The name of that authority, which depends on the visitor's country, is listed in the \"To be completed before launch\" section."
      ]
    }
  ],
  placeholders: [
    "Data controller (company name, address)",
    "Data protection officer (contact)",
    "Competent supervisory authority",
    "Precise retention periods per data category"
  ]
};

export const privacyContent: Record<ContentLocale, LegalPage> = { fr, en };
