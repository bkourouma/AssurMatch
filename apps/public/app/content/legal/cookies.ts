import type { ContentLocale, LegalPage } from "../types";

const fr: LegalPage = {
  slug: "cookies",
  title: "Cookies",
  description: "Les cookies déposés par AssurMatch à la date de cette page, et pourquoi.",
  updatedAt: "2026-10-08",
  summary: [
    "À la date de cette page, le site dépose deux cookies : am_pays (le pays choisi, 180 jours) et NEXT_LOCALE (la langue, le temps de la session du navigateur).",
    "Ils servent uniquement à la navigation : am_pays contient un code pays à deux lettres, NEXT_LOCALE un code de langue ; ni l'un ni l'autre ne contient d'information qui vous identifie directement.",
    "Nous les considérons comme strictement nécessaires : ils peuvent être exemptés de consentement selon la réglementation applicable.",
    "À notre connaissance, le site ne dépose aucun cookie de publicité ni de mesure d'audience à cette date.",
    "Cette page est mise à jour si nos pratiques changent."
  ],
  sections: [
    {
      id: "cookie-fonctionnel",
      heading: "Les cookies que nous utilisons",
      body: [
        "À la date de cette page, AssurMatch dépose deux cookies. Le premier, am_pays, mémorise le pays choisi par le visiteur pour que la navigation reste cohérente d'une page à l'autre, sans avoir à le resélectionner à chaque visite. Le second, NEXT_LOCALE, mémorise la langue d'affichage (français ou anglais) le temps de la session du navigateur.",
        "am_pays est conservé 180 jours ; NEXT_LOCALE est supprimé à la fermeture du navigateur. Ils s'appliquent à l'ensemble du site et ne sont pas transmis à un autre site. Ils ne contiennent qu'un code pays à deux lettres et un code de langue, sans information qui vous identifie directement. Nous les considérons comme strictement nécessaires au fonctionnement du site ; ils peuvent être exemptés de consentement selon la réglementation applicable."
      ]
    },
    {
      id: "pas-de-suivi",
      heading: "Ce que nous ne faisons pas",
      body: [
        "À notre connaissance et à la date de cette page, le site ne dépose pas de cookie de mesure d'audience, de publicité ou de suivi entre sites, et nous ne partageons pas de données de navigation à des fins publicitaires.",
        "Cette page est mise à jour si nos pratiques changent. Avant tout dépôt d'un cookie qui ne serait pas strictement nécessaire, nous recueillerions votre consentement, conformément à la réglementation applicable."
      ]
    },
    {
      id: "gestion",
      heading: "Comment le désactiver",
      body: [
        "Ces cookies étant considérés comme strictement nécessaires à la navigation (sélecteur de pays et langue), ils peuvent être exemptés de consentement préalable selon la réglementation applicable.",
        "Ils peuvent néanmoins être supprimés à tout moment depuis les réglages du navigateur. Sans am_pays, AssurMatch retente une détection du pays à chaque visite à partir d'informations techniques de connexion, ou demande simplement au visiteur de choisir son pays."
      ]
    }
  ]
};

const en: LegalPage = {
  slug: "cookies",
  title: "Cookies",
  description: "The cookies AssurMatch sets as of the date of this page, and why.",
  updatedAt: "2026-10-08",
  summary: [
    "As of the date of this page, the site sets two cookies: am_pays (the country you chose, 180 days) and NEXT_LOCALE (the language, for the browser session).",
    "They are used for navigation only: am_pays holds a two-letter country code and NEXT_LOCALE a language code; neither holds information that directly identifies you.",
    "We consider them strictly necessary: they may be exempt from consent under the applicable regulations.",
    "To our knowledge, the site sets no advertising or audience-measurement cookie as of that date.",
    "This page is updated if our practices change."
  ],
  sections: [
    {
      id: "cookie-fonctionnel",
      heading: "The cookies we use",
      body: [
        "As of the date of this page, AssurMatch sets two cookies. The first, am_pays, remembers the country the visitor chose so that browsing stays consistent from page to page, without having to reselect it on every visit. The second, NEXT_LOCALE, remembers the display language (French or English) for the browser session.",
        "am_pays is kept for 180 days; NEXT_LOCALE is deleted when the browser is closed. They apply to the whole site and are not sent to another site. They only hold a two-letter country code and a language code, with no information that directly identifies you. We consider them strictly necessary for the site to work; they may be exempt from consent under the applicable regulations."
      ]
    },
    {
      id: "pas-de-suivi",
      heading: "What we do not do",
      body: [
        "To our knowledge and as of the date of this page, the site sets no audience-measurement, advertising or cross-site tracking cookie, and we do not share browsing data for advertising purposes.",
        "This page is updated if our practices change. Before any cookie that is not strictly necessary is set, we would ask for your consent, in line with the applicable regulations."
      ]
    },
    {
      id: "gestion",
      heading: "How to turn it off",
      body: [
        "As these cookies are considered strictly necessary for navigation (country selector and language), they may be exempt from prior consent under the applicable regulations.",
        "They can still be removed at any time from the browser's settings. Without am_pays, AssurMatch simply tries to detect the country again on each visit from technical connection information, or asks the visitor to choose it."
      ]
    }
  ]
};

export const cookiesContent: Record<ContentLocale, LegalPage> = { fr, en };
