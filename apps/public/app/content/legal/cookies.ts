import type { ContentLocale, LegalPage } from "../types";

const fr: LegalPage = {
  slug: "cookies",
  title: "Cookies",
  description: "Le seul cookie utilisé par AssurMatch aujourd'hui, et pourquoi.",
  updatedAt: "2026-09-19",
  sections: [
    {
      id: "cookie-fonctionnel",
      heading: "Un unique cookie fonctionnel",
      body: [
        "AssurMatch dépose aujourd'hui un seul cookie, nommé am_pays. Il mémorise le pays choisi par le visiteur pour que la navigation reste cohérente d'une page à l'autre, sans avoir à le resélectionner à chaque visite.",
        "Ce cookie est conservé 180 jours, s'applique à l'ensemble du site et n'est transmis à aucun autre site. Il ne contient aucune donnée personnelle identifiante : uniquement un code pays à deux lettres."
      ]
    },
    {
      id: "pas-de-suivi",
      heading: "Aucun cookie de mesure d'audience ni publicitaire",
      body: [
        "Le site ne dépose aujourd'hui aucun cookie de mesure d'audience, de publicité ou de suivi entre sites. Aucune donnée de navigation n'est partagée avec un tiers à des fins de ciblage.",
        "Si cela devait changer, cette page serait mise à jour et un bandeau de consentement serait affiché avant le dépôt de tout cookie non strictement nécessaire."
      ]
    },
    {
      id: "gestion",
      heading: "Gérer ce cookie",
      body: [
        "Le cookie am_pays étant strictement nécessaire au fonctionnement du sélecteur de pays, il ne requiert pas de consentement préalable.",
        "Il peut néanmoins être supprimé à tout moment depuis les réglages du navigateur. Sans lui, AssurMatch retente une détection du pays à chaque visite à partir d'informations techniques de connexion, ou demande simplement au visiteur de choisir son pays."
      ]
    }
  ]
};

const en: LegalPage = {
  slug: "cookies",
  title: "Cookies",
  description: "The one cookie AssurMatch uses today, and why.",
  updatedAt: "2026-09-19",
  sections: [
    {
      id: "cookie-fonctionnel",
      heading: "One functional cookie",
      body: [
        "AssurMatch currently sets a single cookie, named am_pays. It remembers the country the visitor chose so that browsing stays consistent from page to page, without having to reselect it on every visit.",
        "This cookie is kept for 180 days, applies to the whole site and is never sent to another site. It contains no identifying personal data — only a two-letter country code."
      ]
    },
    {
      id: "pas-de-suivi",
      heading: "No analytics or advertising cookie",
      body: [
        "The site does not currently set any analytics, advertising or cross-site tracking cookie. No browsing data is shared with a third party for targeting purposes.",
        "Should this change, this page would be updated and a consent banner would be shown before any non strictly necessary cookie is set."
      ]
    },
    {
      id: "gestion",
      heading: "Managing this cookie",
      body: [
        "Because am_pays is strictly necessary for the country selector to work, it does not require prior consent.",
        "It can still be removed at any time from the browser's settings. Without it, AssurMatch simply tries to detect the country again on each visit from technical connection information, or asks the visitor to choose it."
      ]
    }
  ]
};

export const cookiesContent: Record<ContentLocale, LegalPage> = { fr, en };
