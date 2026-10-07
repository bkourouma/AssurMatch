import type { ContentLocale, ContentSection } from "./types";

/** One of the five verifiable commitments of "Notre engagement" / "Our commitment". */
export interface CommitmentItem {
  /** Stable id, used as an in-page anchor (e.g. "transparence"). */
  id: string;
  /** Short label shown as the card title (e.g. "Transparence"). */
  heading: string;
  /** The commitment itself, in one sentence. */
  statement: string;
  /** "Ce que ça veut dire concrètement": one or more paragraphs. */
  whatItMeans: string[];
  /** "Comment vérifier". */
  howToVerify: string;
  /** "Limite". */
  limit: string;
}

export interface CommitmentContent {
  /** Hero body paragraph: the medium positioning sentence of the editorial charter. */
  intro: string;
  commitments: CommitmentItem[];
  /** "Ce que nous ne ferons pas". */
  notDone: ContentSection;
  /** "Si quelque chose ne va pas": body paragraph, the link to Contact is added by the page. */
  ifSomethingIsWrong: ContentSection;
}

const fr: CommitmentContent = {
  intro:
    "AssurMatch compare des offres indicatives et vous met en relation avec un courtier autorisé. Nous ne vendons pas d'assurance, nous ne signons pas de contrat et nous ne recevons pas votre prime.",
  commitments: [
    {
      id: "transparence",
      heading: "Transparence",
      statement: "Nous disons ce que nous savons, ce que nous ne savons pas et ce qui reste à confirmer.",
      whatItMeans: [
        "Chaque offre affiche un prix indicatif marqué comme tel. Chaque contenu généré par l'assistant de lecture porte la mention « Réponse générée automatiquement par un outil d'IA. Aide à la lecture, pas un conseil. ».",
        "Une information que nous n'avons pas encore (délai de réponse moyen, nombre de demandes traitées) n'est pas remplacée par un chiffre inventé : elle est absente de la page, ou marquée à confirmer."
      ],
      howToVerify:
        "Cherchez la mention « prix indicatif, à confirmer par le courtier partenaire » sous chaque prix, et l'étiquette de l'assistant de lecture sous chaque réponse générée par IA.",
      limit:
        "Le contenu descriptif d'une offre (garanties, exclusions) provient du courtier partenaire ou de l'assureur ; AssurMatch l'affiche tel que transmis et ne le vérifie pas ligne à ligne."
    },
    {
      id: "independance-du-score",
      heading: "Indépendance du score",
      statement: "Payer pour être visible ne change jamais le score d'une offre.",
      whatItMeans: [
        "Le tri par défaut d'une liste d'offres repose sur un score qui tient compte du prix, du niveau de garantie, de la franchise et du délai de traitement annoncé.",
        "Une offre sponsorisée suit exactement le même calcul que les autres ; elle ne peut jamais occuper la première position du classement du seul fait d'être sponsorisée, et elle est toujours signalée par un badge orange visible."
      ],
      howToVerify:
        "Sur une liste d'offres, changez le tri (prix, garanties, rapidité) et observez qu'une offre sponsorisée peut monter ou descendre exactement comme une offre non sponsorisée.",
      limit:
        "Le classement reste indicatif : il ne remplace pas l'examen du courtier partenaire, qui peut ajuster le prix ou les conditions après étude de la demande."
    },
    {
      id: "securite-des-donnees",
      heading: "Sécurité des données",
      statement: "Vos données ne circulent que là où c'est nécessaire, et vous pouvez reprendre la main.",
      whatItMeans: [
        "Votre consentement est enregistré avec sa date.",
        "Un nombre trop élevé de demandes envoyées en peu de temps depuis la même origine est automatiquement limité, pour réduire les abus et les demandes frauduleuses.",
        "Aucune information personnelle (nom, e-mail, téléphone) n'apparaît dans l'adresse de la page de suivi d'une demande : cette page utilise une référence, pas vos coordonnées.",
        "Une demande de devis n'est transmise qu'au courtier partenaire (ou, si vous cochez explicitement l'option multi-courtiers, jusqu'à trois courtiers partenaires) responsable de votre pays et de votre produit ; elle n'est ni publiée ni revendue.",
        "Vous pouvez retirer votre consentement à tout moment depuis la page de suivi de votre demande."
      ],
      howToVerify:
        "Depuis la page de suivi d'une demande, vérifiez que son adresse ne contient ni votre nom ni votre e-mail, et repérez l'option de retrait du consentement.",
      limit:
        "Cette page ne décrit que ce qui est vérifiable par le visiteur lui-même : le chiffrement des données au repos, les certifications de sécurité et la procédure de notification en cas d'incident n'y sont pas détaillés."
    },
    {
      id: "remuneration-par-les-courtiers",
      heading: "Rémunération par les courtiers",
      statement: "Nous sommes payés par les courtiers partenaires, jamais par vous.",
      whatItMeans: [
        "Le modèle économique combine des frais de mise en service, un abonnement mensuel selon le plan du courtier partenaire (Starter, Pro ou Enterprise) et des frais par demande qualifiée transmise. AssurMatch ne perçoit aucune commission sur la prime d'assurance et ne la collecte jamais."
      ],
      howToVerify: "Les formules et leurs tarifs par pays sont publiés sur la page Tarifs courtiers.",
      limit:
        "Un courtier qui paie un abonnement plus élevé peut sponsoriser davantage d'offres ; cela ne change ni leur score ni leur position par défaut (voir Indépendance du score)."
    },
    {
      id: "rien-a-payer-pour-le-visiteur",
      heading: "Rien à payer pour le visiteur",
      statement: "Comparer des offres et demander un devis ne vous coûte rien.",
      whatItMeans: [
        "Vous ne payez rien à AssurMatch. Le prix de l'assurance est fixé par l'assureur et confirmé par le courtier. AssurMatch ne demande jamais de coordonnées bancaires et ne propose aucun paiement en ligne."
      ],
      howToVerify: "Aucune étape du parcours de comparaison ou de demande de devis ne demande un numéro de carte ou un identifiant Mobile Money.",
      limit: "Le prix de l'assurance que vous payez à l'assureur, lui, n'est pas gratuit : seule la mise en relation via AssurMatch l'est."
    }
  ],
  notDone: {
    id: "ce-que-nous-ne-ferons-pas",
    heading: "Ce que nous ne ferons pas",
    body: ["Pour que ces engagements restent vérifiables, AssurMatch :"],
    bullets: [
      "ne vendra jamais vos données à un tiers à des fins commerciales ;",
      "ne changera jamais le score d'une offre parce qu'elle est sponsorisée ;",
      "ne vous demandera jamais de payer pour comparer ou demander un devis ;",
      "n'affichera aucun témoignage tant qu'il n'aura pas été vérifié ;",
      "ne promettra jamais un délai de réponse qui n'a pas été mesuré."
    ]
  },
  ifSomethingIsWrong: {
    id: "si-quelque-chose-ne-va-pas",
    heading: "Si quelque chose ne va pas",
    body: [
      "Si l'un de ces engagements ne vous semble pas respecté, écrivez-nous depuis la page Contact en choisissant « Visiteur » : décrivez l'offre ou la demande concernée, nous vous répondons par e-mail.",
      "Pour une question relative à vos données personnelles, la page Confidentialité détaille vos droits et l'autorité de contrôle compétente."
    ]
  }
};

const en: CommitmentContent = {
  intro:
    "AssurMatch compares indicative offers and introduces you to an authorised broker. We do not sell insurance, we do not sign a contract and we do not receive your premium.",
  commitments: [
    {
      id: "transparence",
      heading: "Transparency",
      statement: "We say what we know, what we do not know, and what is still to be confirmed.",
      whatItMeans: [
        "Every offer shows an indicative price marked as such. Every content generated by the reading assistant carries the note \"Answer automatically generated by an AI tool. Help to read, not advice.\".",
        "Information we do not have yet (average broker response time, number of requests processed) is never replaced by an invented figure: it is left off the page, or marked to be confirmed."
      ],
      howToVerify: "Look for the note \"indicative price, to be confirmed by the partner broker\" under each price, and the reading assistant's label under each AI-generated answer.",
      limit:
        "An offer's descriptive content (guarantees, exclusions) comes from the partner broker or the insurer; AssurMatch displays it as provided and does not verify it line by line."
    },
    {
      id: "independance-du-score",
      heading: "Independence of the score",
      statement: "Paying to be visible never changes an offer's score.",
      whatItMeans: [
        "The default sort of an offer list relies on a score that factors in price, guarantee level, deductible and the announced processing time.",
        "A sponsored offer follows exactly the same calculation as any other; it can never take the first position of the ranking simply for being sponsored, and it always carries a visible orange badge."
      ],
      howToVerify: "On an offer list, change the sort order (price, guarantees, speed) and see that a sponsored offer can move up or down exactly like a non-sponsored one.",
      limit: "The ranking stays indicative: it does not replace the partner broker's review, who may adjust the price or the conditions after examining the request."
    },
    {
      id: "securite-des-donnees",
      heading: "Data security",
      statement: "Your data only travels where it needs to, and you can take back control.",
      whatItMeans: [
        "Your consent is recorded with its date.",
        "Too many requests sent in a short time from the same origin are automatically limited, to reduce abuse and fraudulent requests.",
        "No personal information (name, e-mail, phone) appears in a request's tracking page address: that page uses a reference, not your contact details.",
        "A quote request is transmitted only to the partner broker (or, if you explicitly tick the multi-broker option, up to three partner brokers) responsible for your country and product; it is never published or resold.",
        "You can withdraw your consent at any time from your request's tracking page."
      ],
      howToVerify: "From a request's tracking page, check that its address contains neither your name nor your e-mail, and locate the consent withdrawal option.",
      limit:
        "This page only describes what a visitor can verify themselves: encryption of data at rest, security certifications and the incident-notification procedure are not detailed here."
    },
    {
      id: "remuneration-par-les-courtiers",
      heading: "Paid by brokers",
      statement: "We are paid by partner brokers, never by you.",
      whatItMeans: [
        "The revenue model combines a setup fee, a monthly subscription depending on the partner broker's plan (Starter, Pro or Enterprise) and a fee per qualified lead transmitted. AssurMatch never takes a commission on the insurance premium and never collects it."
      ],
      howToVerify: "The plans and their prices per country are published on the Broker pricing page.",
      limit: "A broker paying a higher subscription may sponsor more offers; this changes neither their score nor their default position (see Independence of the score)."
    },
    {
      id: "rien-a-payer-pour-le-visiteur",
      heading: "Nothing for the visitor to pay",
      statement: "Comparing offers and requesting a quote costs you nothing.",
      whatItMeans: [
        "You pay nothing to AssurMatch. The price of the insurance is set by the insurer and confirmed by the broker. AssurMatch never asks for banking details and offers no online payment."
      ],
      howToVerify: "No step of the comparison or quote request journey asks for a card number or a Mobile Money identifier.",
      limit: "The price of the insurance you pay the insurer is not free: only the introduction through AssurMatch is."
    }
  ],
  notDone: {
    id: "ce-que-nous-ne-ferons-pas",
    heading: "What we will not do",
    body: ["For these commitments to stay verifiable, AssurMatch:"],
    bullets: [
      "will never sell your data to a third party for commercial purposes;",
      "will never change an offer's score because it is sponsored;",
      "will never ask you to pay to compare offers or request a quote;",
      "will not display any testimonial until it has been verified;",
      "will never promise a response time that has not been measured."
    ]
  },
  ifSomethingIsWrong: {
    id: "si-quelque-chose-ne-va-pas",
    heading: "If something feels wrong",
    body: [
      "If one of these commitments does not seem respected, write to us from the Contact page, choosing \"Visitor\": describe the offer or request concerned, and we will answer by e-mail.",
      "For a question about your personal data, the Privacy page details your rights and the competent supervisory authority."
    ]
  }
};

export const commitmentContent: Record<ContentLocale, CommitmentContent> = { fr, en };

export function getCommitmentContent(locale: ContentLocale): CommitmentContent {
  return commitmentContent[locale];
}
